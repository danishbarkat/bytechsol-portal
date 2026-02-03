import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../utils/supabase';
import Icon3D from '../../components/Icon3D';

interface Props {
    onBack: () => void;
}

export default function LeaveRequestForm({ onBack }: Props) {
    // Form State
    const [employeeId, setEmployeeId] = useState('');
    const [leaveType, setLeaveType] = useState('Sick Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!employeeId || !startDate || !endDate || !reason) {
            Alert.alert("Error", "Please fill all fields");
            return;
        }

        setLoading(true);
        try {
            // 1. Verify Employee
            const normalizedId = employeeId.trim().toUpperCase().replace(/\s+/g, '').replace(/^BS-/, '');
            const dbId = `BS-${normalizedId}`;

            const { data: user, error: userError } = await supabase
                .from('users')
                .select('id, name')
                .eq('employee_id', dbId)
                .single();

            if (userError || !user) {
                Alert.alert("Error", "Invalid Employee ID");
                setLoading(false);
                return;
            }

            // 2. Submit Request
            const { error: insertError } = await supabase
                .from('leave_requests')
                .insert([{
                    user_id: user.id,
                    user_name: user.name,
                    leave_type: leaveType,
                    start_date: startDate,
                    end_date: endDate,
                    reason: reason,
                    status: 'Pending'
                }]);

            if (insertError) throw insertError;

            Alert.alert("Success", "Leave request submitted successfully", [
                { text: "OK", onPress: onBack }
            ]);

        } catch (e: any) {
            Alert.alert("Error", e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
                <ScrollView contentContainerStyle={{ padding: 24 }}>

                    <TouchableOpacity onPress={onBack} className="mb-6 flex-row items-center gap-2">
                        <Text className="text-blue-500 font-bold">← Back to Login</Text>
                    </TouchableOpacity>

                    <View className="mb-8">
                        <Icon3D icon="Plane" size="lg" variant="blue" />
                        <Text className="text-3xl font-black text-slate-900 mt-4">Apply for Leave</Text>
                        <Text className="text-slate-500 mt-1">Submit your leave request for approval.</Text>
                    </View>

                    <View className="space-y-4">
                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Employee ID</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700"
                                placeholder="BS-000"
                                value={employeeId}
                                onChangeText={setEmployeeId}
                                autoCapitalize="characters"
                            />
                        </View>

                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Leave Type</Text>
                            {/* Simple Selector for now */}
                            <View className="flex-row gap-2">
                                {['Sick Leave', 'Casual Leave', 'Annual'].map(type => (
                                    <TouchableOpacity
                                        key={type}
                                        onPress={() => setLeaveType(type)}
                                        className={`px-4 py-2 rounded-full border ${leaveType === type ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-200'}`}
                                    >
                                        <Text className={`text-xs font-bold ${leaveType === type ? 'text-white' : 'text-slate-500'}`}>{type}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View className="flex-row gap-4">
                            <View className="flex-1 space-y-2">
                                <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Start Date</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700"
                                    placeholder="YYYY-MM-DD"
                                    value={startDate}
                                    onChangeText={setStartDate}
                                />
                            </View>
                            <View className="flex-1 space-y-2">
                                <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">End Date</Text>
                                <TextInput
                                    className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700"
                                    placeholder="YYYY-MM-DD"
                                    value={endDate}
                                    onChangeText={setEndDate}
                                />
                            </View>
                        </View>

                        <View className="space-y-2">
                            <Text className="text-xs uppercase font-bold text-slate-400 tracking-wider">Reason</Text>
                            <TextInput
                                className="bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-700 h-24"
                                placeholder="Reason for leave..."
                                value={reason}
                                onChangeText={setReason}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>

                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={loading}
                            className={`bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-500/30 mt-4 ${loading ? 'opacity-50' : ''}`}
                        >
                            <Text className="text-white font-black uppercase tracking-widest text-lg">
                                {loading ? 'Submitting...' : 'Submit Request'}
                            </Text>
                        </TouchableOpacity>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
